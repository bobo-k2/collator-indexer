# SubQuery - Astar Collator Indexer


The goal of this project is to collect Astar collators performance data and to indentify low performance collators.

## Preparation

#### Environment

- [Typescript](https://www.typescriptlang.org/) are required to compile project and define types.  

- Both SubQuery CLI and generated Project have dependencies and require [Node](https://nodejs.org/en/).
     

#### Instal dependencies
Last, under the project directory, run following command to install all the dependency.
```
yarn install
```

#### Code generation

In order to index your SubQuery project, it is mandatory to build your project first.
Run this command under the project directory.

````
yarn codegen
````

#### Build the project

```
yarn build
```

## Indexing and Query

#### Run required systems in docker


Under the project directory run following command:

```
docker-compose pull && docker-compose up
```
#### Query the project

Open your browser and head to `http://localhost:3000`.

Finally, you should see a GraphQL playground is showing in the explorer and the schemas that ready to query.

For the `collator-indexer` project, you can try to query with the following code to get block production per collator per day. Play with dayId parameter to get data for different dates. DayId is in format yyyyMMdd

````graphql
{
  query {
    blockProductions(filter: {
      dayId: {
        equalTo: "20220224"
      }
    },
    orderBy: AVG_BLOCK_PRODUCTION_OFFSET_DESC) {
      nodes {
        collatorId,
        blocksProduced,
        avgBlockProductionOffset
      }
    }
  }
}
````

To get total block produced per collator from block 480000 try the following query

````graphql
{
  query {
    collators(orderBy: BLOCKS_PRODUCED_DESC) {
      nodes {
        id,
        blocksProduced
      }
    }
  }
}
````