import {SubstrateBlock} from "@subql/types";
import {Collator, Day, BlockProduction, BlockRealTimeData, BlockProductionStatus} from "../types";
import type { AccountId, Digest } from '@polkadot/types/interfaces';
import { encodeAddress } from '@polkadot/util-crypto'
import { getBlockWeigh, handleBlockWeight } from "./blockWeight";
import crypto from "crypto";

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

function getBlockProductionKey(date: Date, author: string): string {
  return `${formatDate(date)}_${author}`;
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
  const validators = await api.query.session.validators();
  if (validators) {
    const day = await Day.get(formatDate(date));

    if (day) {
      const blocksProducedInDay = day.lastBlock - day.firstBlock + BigInt(1);
      const avgPerValidator = Number(blocksProducedInDay.toString()) / validators.length;

      validators.forEach(async validator => {
        const id = getBlockProductionKey(date, validator.toString());
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

// hexToString from @polkadot/util raises "TypeError: The "input" argument must be an instance of ArrayBuffer or ArrayBufferView. Received an instance of Object"
function hex2string(hex: string) {
  if (hex.startsWith('0x')) {
    hex = hex.substring(2);
  }
  let str = '';
  for (let i = 0; i < hex.length; i += 2)
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  return str;
}

const sS58Format = 5;
async function getCollator(address: string): Promise<Collator> {
  let collator = await Collator.get(address);

  if (!collator) {
    collator = new Collator(address);
    collator.blocksProduced = 0;
    collator.blocksMissed = 0;

    const identity = await (await api.query.identity.identityOf(address)).unwrapOrDefault();
    if (identity) {
      const name = identity.info.display.toString();
      if (name !== 'None') {
        const nameString = JSON.parse(name).raw.toString();
        collator.name = hex2string(nameString);
      }
    }
  }

  return collator;
}

function convertAddressToSS58(accountId: string): string {
  const convertedAddress = encodeAddress(accountId, sS58Format);

  return convertedAddress;
}

async function getBlockProduction(block: SubstrateBlock, address: string): Promise<BlockProduction> {
  const id = getBlockProductionKey(block.timestamp, address);
  let blockProduction = await BlockProduction.get(id);

  if (!blockProduction) {
    blockProduction = new BlockProduction(id);
    blockProduction.collatorId = address;
    blockProduction.dayId = formatDate(block.timestamp);
    blockProduction.blocksProduced = 0;
    blockProduction.blocksMissed = 0;
    blockProduction.avgBlockProductionOffset = 0;
  }

  return blockProduction;
}


let currentValidator = '';

export async function handleBlock(block: SubstrateBlock): Promise<void> {
    await handleDayStartEnd(block);

    const validators = await api.query.session.validators();
    const author = extractAuthor(block.block.header.digest, validators);

    if (author) {
      const authorAddress = author.toString();

      // check if validator missed a block.
      if(!currentValidator) {
        // await getCollators();
        currentValidator = authorAddress;
        // TODO find next 
      } else {
        while (currentValidator !== authorAddress) {
          logger.warn(`Validator ${currentValidator} missed block ${block.block.header.number}`);

          await handleRealTimeData(block, currentValidator, true);

          const current = await getCollator(currentValidator);
          current.blocksMissed++;
          await current.save();

          const currentProduction = await getBlockProduction(block, currentValidator);
          currentProduction.blocksMissed++;
          await currentProduction.save();

          let currentValidatorIndex = validators.indexOf(currentValidator);
          currentValidatorIndex = (currentValidatorIndex+ 1) % validators.length;
          currentValidator = validators[currentValidatorIndex].toString();
        }
      }

      await handleRealTimeData(block, authorAddress, false);

      // aggregate total blocks produced by a validator
      let collator = await getCollator(authorAddress);
      collator.blocksProduced++;
      await collator.save();

      // aggregate total blocks produced per validator per day
      const blockProduction = await getBlockProduction(block, authorAddress);
      blockProduction.blocksProduced++;
      await blockProduction.save();

      // determine next validator
      const nextValidatorIndex = (validators.indexOf(authorAddress) + 1) % validators.length;
      currentValidator = validators[nextValidatorIndex].toString();
      
      // await handleBlockWeight(block, author);
    } else {
      logger.error(`Unable to extract collator address for block ${block.block.header.hash.toString()}`);
    }
}

async function handleRealTimeData(block:SubstrateBlock, collatorAddress: string, isMissed: boolean) {
  const id = crypto.randomUUID();
  const record = new BlockRealTimeData(id);
  record.blockNumber = block.block.header.number.toBigInt();
  record.collatorAddress = collatorAddress;
  record.timestamp = BigInt(block.timestamp.getTime());
  record.status = isMissed ? BlockProductionStatus.Missed : BlockProductionStatus.Produced

  if (!isMissed) {
    const weigh = await getBlockWeigh(block);
    record.extrinsicsCount = block.block.extrinsics.length;
    record.weight = weigh.weight;
    record.weightRatio = weigh.weightRatio;
  }

  await record.save();
}
