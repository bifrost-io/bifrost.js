// Copyright 2020 @bifrost-finance/api-derive authors & contributors
// This software may be modified and distributed under the terms
// of the Apache-2.0 license. See the LICENSE file for details.

import { ApiInterfaceRx } from '@polkadot/api/types';
import { map, mergeMap } from 'rxjs/operators';
import { Observable, combineLatest } from 'rxjs';
import { BlockHash } from '@polkadot/types/interfaces/chain';
import { getDesignatedBlockHash } from '../util';
import { memo } from '@polkadot/api-derive/util';
import BN from 'bn.js';
import { vToken, bifrostVtokenList } from '../type';
import { convertPool } from './types';

/**
 * @name getPoolInfo
 * @description get Single Token Pool information
 * @param instanceId
 * @param api
 */

/** Some notes for understanding:
* Memo function takes two parameters, of which the second is a function.
* The return value of memo is the function we've sent to it as a parameter for cache optimization sake.
* The returned function from memo is also the return value of function getPoolInfo which is shown in the latter part of the function signature.
* The returned function's input parameters are tokenSymbol and preBlockHash, and output is a Observable<ConvertPool> type.
*/

export function getPoolInfo (instanceId: string, api: ApiInterfaceRx): (tokenSymbol: vToken, preBlockHash?: BlockHash) => Observable<convertPool> {
  return memo(instanceId, (tokenSymbol: vToken, preBlockHash?: BlockHash) => {
    let result;

    if (preBlockHash === undefined) {
      result = api.query.convert.pool(tokenSymbol);
    } else {
      result = api.query.convert.pool.at(preBlockHash, tokenSymbol);
    }

    return result.pipe(map((res) => {
      return {
        current_reward: new BN(res.current_reward),
        pending_reward: new BN(res.pending_reward),
        token_pool: new BN(res.token_pool),
        vtoken_pool: new BN(res.vtoken_pool)
      };
    }));
  });
}

/**
 * @name getAllVtokenConvertInfo
 * @description get all vToken convertPool information
 * @param instanceId
 * @param api
 */
export function getAllVtokenConvertInfo (instanceId: string, api: ApiInterfaceRx): (vTokenArray?:vToken[]) => Observable<convertPool[]> {
  return memo(instanceId, (vTokenArray?:vToken[]) => {
    let vTokenList: vToken[];

    if (vTokenArray === undefined) {
      vTokenList = bifrostVtokenList as vToken[];
    } else {
      vTokenList = vTokenArray;
    }

    const getPoolInfoQuery = getPoolInfo(instanceId, api);

    return combineLatest(vTokenList.map((vtk) => getPoolInfoQuery(vtk)));
  });
}

/**
 * @name getConvertPriceInfo
 * @description get single Token/vToken convert price information
 * @param instanceId
 * @param api
 */
export function getConvertPriceInfo (instanceId: string, api: ApiInterfaceRx): (tokenSymbol: vToken, preBlockHash?: BlockHash) => Observable<number> {
  return memo(instanceId, (tokenSymbol: vToken, preBlockHash?: BlockHash):any => {
    const convertPoolQuery = getPoolInfo(instanceId, api);

    return convertPoolQuery(tokenSymbol, preBlockHash).pipe(
      map((result) => {
        let convertPrice;
        const tokenPool = new BN(result.token_pool.toNumber());

        if (result.vtoken_pool.toNumber()) {
          const vtokenPool = new BN(result.vtoken_pool.toNumber());

          convertPrice = tokenPool.div(vtokenPool);
        } else {
          convertPrice = 0;
        }

        return convertPrice;
      })
    );
  });
}

/**
 * @name getAllConvertPriceInfo
 * @description get all vToken current convert price information
 * @param instanceId
 * @param api
 */
export function getAllConvertPriceInfo (instanceId: string, api: ApiInterfaceRx): (vTokenArray?:vToken[]) => Observable<number[]> {
  return memo(instanceId, (vTokenArray?:vToken[]) => {
    let vTokenList: vToken[];

    if (vTokenArray === undefined) {
      vTokenList = bifrostVtokenList as vToken[];
    } else {
      vTokenList = vTokenArray;
    }

    const getConvertPriceInfoQuery = getConvertPriceInfo(instanceId, api);

    return combineLatest(vTokenList.map((vtk) => getConvertPriceInfoQuery(vtk)));
  });
}

/**
 * @name getAnnualizedRate
 * @description get Single Token Annualized Rate information
 * @param instanceId
 * @param api
 */
export function getAnnualizedRate (instanceId: string, api: ApiInterfaceRx): (tokenSymbol: vToken) => Observable<number> {
  return memo(instanceId, (tokenSymbol: vToken) => {
    const convertPriceQuery = getConvertPriceInfo(instanceId, api);

    // Query the convert price of current block
    const currentPrice$ = convertPriceQuery(tokenSymbol);

    // Query the convert price of the designated block
    const preBlockHashQuery = getDesignatedBlockHash(instanceId, api);
    const historicalPrice$ = preBlockHashQuery().pipe(
      mergeMap((preHash) => { // mergeMap operator is used to flatten the two levels of Observables into one.
        return convertPriceQuery(tokenSymbol, preHash);
      }
      )
    );

    // combine two Observables together, destruct the values we need, and do necessary calculations before returning the results.
    return combineLatest([
      currentPrice$,
      historicalPrice$
    ]).pipe(
      map(([currentPrice, historicalPrice]) => {
        let annualizedRate;

        if (historicalPrice !== 0) {
          annualizedRate = (currentPrice - historicalPrice) / (historicalPrice) / 7 * 365;
        } else {
          annualizedRate = 0;
        }

        return annualizedRate;
      }
      )
    );
  }
  );
}

/**
 * @name getAllAnnualizedRate
 * @description get all vToken Annualized Rate information
 * @param instanceId
 * @param api
 */
export function getAllAnnualizedRate (instanceId: string, api: ApiInterfaceRx): (vTokenArray?:vToken[]) => Observable<number[]> {
  return memo(instanceId, (vTokenArray?:vToken[]) => {
    let vTokenList: vToken[];

    if (vTokenArray === undefined) {
      vTokenList = bifrostVtokenList as vToken[];
    } else {
      vTokenList = vTokenArray;
    }

    const getAnnualizedRateQuery = getAnnualizedRate(instanceId, api);

    return combineLatest(vTokenList.map((vtk) => getAnnualizedRateQuery(vtk)));
  });
}

/**
 * @name getBatchConvertPrice
 * @description get the header information of current block
 * @param instanceId
 * @param api
 */

export function getBatchConvertPrice (instanceId: string, api: ApiInterfaceRx): (tokenSymbol: vToken, blockHashArray: Observable<BlockHash[]>) => Observable<number[]> {
  return memo(instanceId, (tokenSymbol: vToken, blockHashArray: Observable<BlockHash[]>) => {
    const getConvertPriceInfoQuery = getConvertPriceInfo(instanceId, api);

    return blockHashArray.pipe(mergeMap((blockHashList) => {
      return combineLatest(blockHashList.map((blockHash) => {
        return getConvertPriceInfoQuery(tokenSymbol, blockHash);
      }));
    }));
  }
  );
}
