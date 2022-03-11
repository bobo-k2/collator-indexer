//Exports all handler functions
export * from './mappings/mappingHandlers'
import "@polkadot/api-augment"
import axios from 'axios';
import fs from 'fs';
import { CollatorStats, DailyStats } from './types/collatorStats';

const API_URL = 'https://api.subquery.network/sq/bobo-k2/collator-indexer__Ym9ib';

const getData = async (date: Date): Promise<any> => {
  const formattedDate = date.toISOString().slice(0,10).replace(/-/g,'');
  console.log('Formatted date ', formattedDate);
  const data = await axios.post(API_URL, {
    query: `query {
      blockProductions(filter: {
        dayId: {
          equalTo: "${formattedDate}"
        }
      },
      orderBy: BLOCKS_MISSED_DESC) {
        nodes {
          collatorId,
          collator{
            name
          },
          blocksProduced,
          blocksMissed
        }
      }
    }`
  });

  // console.log(data.data.data.blockProductions.nodes[0]);
  return data.data;
};

const storeCsv = (csv: string): void => {
  fs.writeFileSync('dist/output.csv', csv);
}

const generateCSV = async(startDate: Date): Promise<string> => {
  const now = new Date();
  const stats: CollatorStats[] = [];
  let csv = '';
  for(let d = startDate; d <= now; d.setDate(d.getDate() + 1)) {
    const data = await getData(d);
    data.data.blockProductions.nodes.forEach(node => {
      let stat = stats.find(x => x.id === node.collatorId);
      if (!stat) {
        stat = new CollatorStats();
        stat.id = node.collatorId;
        stat.name = node.collator.name;
        stats.push(stat);
      } 

      stat.stats.push(new DailyStats(new Date(d), node.blocksMissed));
    });
  }

  if (stats.length > 0) {
    // CSV header
    let header = 'Address [Name]';
    stats[0].stats.forEach(s => {
      header = header + `, ${s.date.toLocaleDateString()}`;
    });
    // console.log(header);

    // CSV body
    csv = header + '\n';
    stats.forEach(stat => {
      let row = `${stat.id} [${stat.name?.replace(/[^\x00-\x7F]/g, '')}]`;
      stat.stats.forEach(s => {
        row = row + `, ${s.blocksMissed}`;
      });

      // console.log(row);
      csv += row + '\n';
    });

    console.log(csv);
  } else {
    console.warn('No stats found');
  }

  storeCsv(csv);
  return csv;
}

generateCSV(new Date('2022-03-10'));
