import BN from 'bn.js';
import { FrameSystemEventRecord } from '@polkadot/types/lookup';
import { DispatchInfo, AccountId } from '@polkadot/types/interfaces';
import { SubstrateBlock } from '@subql/types';
import { Block } from '../types';

let maxBlockWeight: number;
async function getMaxBlockWeight(): Promise<number> {
  if (!maxBlockWeight) {
    maxBlockWeight = await api.consts.system.blockWeights.maxBlock.toNumber();
  }

  return maxBlockWeight;
}

function extractBlockWeight (events: FrameSystemEventRecord[]): BN {
  return events.reduce((weight, { event: { data, method, section } }) => 
      section === 'system' && ['ExtrinsicFailed', 'ExtrinsicSuccess'].includes(method)
        ? weight.iadd(((method === 'ExtrinsicSuccess' ? data[0] : data[1]) as DispatchInfo).weight)
        : weight
    , new BN(0));
}

export async function handleBlockWeight (block: SubstrateBlock, author: AccountId): Promise<void> {
  // weight calc
  const events = await api.query.system.events<FrameSystemEventRecord[]>();
  const blockWeight = extractBlockWeight(events);
  const maxWeight = await getMaxBlockWeight();

  const blockRecord = new Block(block.block.header.number.toString());
  blockRecord.collatorId = author?.toString();
  blockRecord.extrinsicsCount = block.block.extrinsics.length;
  blockRecord.weight = BigInt(blockWeight.toString());
  blockRecord.weightRatio = blockWeight.toNumber() / maxWeight;
  await blockRecord.save();  
}