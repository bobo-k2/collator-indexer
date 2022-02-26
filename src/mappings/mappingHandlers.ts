import {SubstrateBlock} from "@subql/types";
import {Collator} from "../types";
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

async function handleStartEnd(block: SubstrateBlock): Promise<void> {
  const date = formatDate(block.timestamp);
}

export async function handleBlock(block: SubstrateBlock): Promise<void> {
    const validators = await api.query.session.validators();
    const author = extractAuthor(block.block.header.digest, validators);

    if (author) {
      let collator = await Collator.get(author.toString());

      if (!collator) {
        collator = new Collator(author.toString());
        collator.blocksProduced = 0;
      }

      collator.blocksProduced++;
      await collator.save();
    
      logger.info(`Block ${block.block.header.hash.toString()} ${block.timestamp} ${author}`);
    } else {
      logger.error(`Unable to extract collator address for block ${block.block.header.hash.toString()}`);
    }
}
