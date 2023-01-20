import BN from 'bn.js';
import { FrameSystemEventRecord } from '@polkadot/types/lookup';
import { DispatchInfo, AccountId, EventRecord, WeightV2 } from '@polkadot/types/interfaces';
import { SubstrateBlock } from '@subql/types';
import { Block } from '../types';

let maxBlockWeight: number;
async function getMaxBlockWeight(): Promise<number> {
  if (!maxBlockWeight) {
    maxBlockWeight = getWeight(await api.consts.system.blockWeights.maxBlock).toNumber();
  }

  return maxBlockWeight;
}

function extractBlockWeightV1 (events: FrameSystemEventRecord[]): BN {
  return events.reduce((weight, { event: { data, method, section } }) => 
      section === 'system' && ['ExtrinsicFailed', 'ExtrinsicSuccess'].includes(method)
        ? weight.iadd(((method === 'ExtrinsicSuccess' ? data[0] : data[1]) as DispatchInfo).weight)
        : weight
    , new BN(0));
}

function getWeight (weight: any): BN {
  const isWeightV2 = 'proofSize' in weight && 'refTime' in weight;
  return isWeightV2 ? (weight as WeightV2).refTime.toBn() : weight;
}

function extractBlockWeightV2 (events: EventRecord[]): BN {
  let result = new BN(0);
  events.forEach(e => {
    const { section, method, data } = e.event;
    if (section === 'system' && ['ExtrinsicFailed', 'ExtrinsicSuccess'].includes(method)) {
      const weight = ((method === 'ExtrinsicSuccess' ? data[0] : data[1]) as DispatchInfo).weight;
      result = result.add(getWeight(weight));
    }
  });
  
  return result;
}

export async function handleBlockWeight (block: SubstrateBlock, author: AccountId): Promise<void> {
  // weight calc 
  // const events = await api.query.system.events<FrameSystemEventRecord[]>();
  const blockWeight = extractBlockWeightV2(block.events);
  const maxWeight = await getMaxBlockWeight();

  const blockRecord = new Block(block.block.header.number.toString());
  blockRecord.collatorId = author?.toString();
  blockRecord.extrinsicsCount = block.block.extrinsics.length;
  blockRecord.weight = BigInt(blockWeight.toString());
  blockRecord.weightRatio = blockWeight.toNumber() / maxWeight;
  await blockRecord.save();  
}

export async function getBlockWeigh(block:SubstrateBlock): Promise<{
  weight: bigint,
  weightRatio: number
}> {
  // const events = await api.query.system.events<FrameSystemEventRecord[]>();
  const blockWeight = extractBlockWeightV2(block.events);
  const maxWeight = await getMaxBlockWeight();

  return {
    weight: BigInt(blockWeight.toString()),
    weightRatio: blockWeight.toNumber() / maxWeight,
  };
}