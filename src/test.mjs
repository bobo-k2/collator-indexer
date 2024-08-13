// // Import
// import { ApiPromise, WsProvider } from "@polkadot/api";

// async function getValidators() {
//   const wsProvider = new WsProvider("wss://rpc.astar.network");
//   const api = await ApiPromise.create({ provider: wsProvider });

//   const hash = await api.rpc.chain.getBlockHash(5700000);
//   const apiAt = await api.at(hash);

//   const validators = await apiAt.query.session.validators();
//   console.log(validators.toHuman());
// }

// getValidators();