import {SubstrateBlock} from "@subql/types";
import {Collator, Day, BlockProduction} from "../types";
import type { AccountId, Digest } from '@polkadot/types/interfaces';

// https://github.com/polkadot-js/api/blob/beffc7b754dce576242a1b17da81c5ff61096631/packages/api-derive/src/type/util.ts#L6
function extractAuthor (digest: Digest, sessionValidators: AccountId[] = []): AccountId | undefined {
  const [citem] = digest.logs.filter((e) => e.isConsensus);
  const [pitem] = digest.logs.filter((e) => e.isPreRuntime);
  const [sitem] = digest.logs.filter((e) => e.isSeal);
  let accountId: AccountId | undefined;

  try {
    // This is critical to be first for BABE (before Consensus)
    // If not first, we end up dropping the author at session-end
    if (pitem) {
      const [engine, data] = pitem.asPreRuntime;

      accountId = engine.extractAuthor(data, sessionValidators);
    }

    if (!accountId && citem) {
      const [engine, data] = citem.asConsensus;

      accountId = engine.extractAuthor(data, sessionValidators);
    }

    // SEAL, still used in e.g. Kulupu for pow
    if (!accountId && sitem) {
      const [engine, data] = sitem.asSeal;

      accountId = engine.extractAuthor(data, sessionValidators);
    }
  } catch {
    // ignore
  }

  return accountId;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0,10).replace(/-/g, '');
}

function getBlockProductionKey(date: Date, author: AccountId): string {
  return `${formatDate(date)}_${author.toString()}`;
}

async function handleDayStartEnd(block: SubstrateBlock): Promise<void> {
  const date = formatDate(block.timestamp);

  let day = await Day.get(date);
  if (!day) {
    day = new Day(date);
    day.firstBlock = block.block.header.number.toBigInt();
    await day.save();

    const prevDate = new Date(block.timestamp);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDay = await Day.get(formatDate(prevDate));
    if (prevDay) {
      prevDay.lastBlock = day.firstBlock - BigInt(1);
      await prevDay.save();

      await calculateMissedBlocks(prevDate);
    }
  }
}

async function calculateMissedBlocks(date: Date): Promise<void> {
  if (validators) {
    const day = await Day.get(formatDate(date));

    if (day) {
      const blocksProducedInDay = day.lastBlock - day.firstBlock + BigInt(1);
      const avgPerValidator = Number(blocksProducedInDay.toString()) / validators.length;

      validators.forEach(async validator => {
        const id = getBlockProductionKey(date, validator);
        const blockProduction = await BlockProduction.get(id);

        if (blockProduction) {
          blockProduction.avgBlockProductionOffset = blockProduction.blocksProduced - avgPerValidator;
          await blockProduction.save();    
        } else {
          logger.warn(`calculateMissedBlocks:: no block production for ${validator} on ${date}`);
        }
      });
    } else {
      logger.warn(`calculateMissedBlocks:: no day defined for ${date}`);
    }
  } else {
    logger.warn('calculateMissedBlocks:: no validators defined');
  }
}

let validators: AccountId[];

export async function handleBlock(block: SubstrateBlock): Promise<void> {
    await handleDayStartEnd(block);

    if (!validators) {
      validators = await api.query.session.validators();
    }
    const author = extractAuthor(block.block.header.digest, validators);

    if (author) {
      // aggregate total blocks produced by a collator
      let collator = await Collator.get(author.toString());

      if (!collator) {
        collator = new Collator(author.toString());
        collator.blocksProduced = 0;
      }

      collator.blocksProduced++;
      await collator.save();

      // aggregate total blocks produced per collator per day
      const id = getBlockProductionKey(block.timestamp, author);
      let blockProduction = await BlockProduction.get(id);

      if (!blockProduction) {
        blockProduction = new BlockProduction(id);
        blockProduction.collatorId = author.toString();
        blockProduction.dayId = formatDate(block.timestamp);
        blockProduction.blocksProduced = 0;
        blockProduction.avgBlockProductionOffset = 0;
      }

      blockProduction.blocksProduced++;
      await blockProduction.save();
    
      // logger.info(`Block ${block.block.header.hash.toString()} ${block.timestamp} ${author}`);
    } else {
      logger.error(`Unable to extract collator address for block ${block.block.header.hash.toString()}`);
    }
}
