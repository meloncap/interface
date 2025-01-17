import { PNG } from '../../constants/tokens'
import { Currency, CurrencyAmount, CAVAX, JSBI, Token, TokenAmount, ChainId } from '@pangolindex/sdk'
import { useMemo, useState, useEffect } from 'react'
import ERC20_INTERFACE from '../../constants/abis/erc20'
import { useActiveWeb3React } from '../../hooks'
import { useMulticallContract } from '../../hooks/useContract'
import { isAddress } from '../../utils'
import { useSingleContractMultipleData, useMultipleContractSingleData } from '../multicall/hooks'
import { useChainId } from 'src/hooks'
import { useTokenBalanceHook } from './multiChainsHooks'
import { useTotalPngEarnedHook } from 'src/state/stake/multiChainsHooks'
import { nearFn } from '@pangolindex/components'

/**
 * Returns a map of the given addresses to their eventually consistent ETH balances.
 */
export function useETHBalances(
  chainId: ChainId,
  uncheckedAddresses?: (string | undefined)[]
): { [address: string]: CurrencyAmount | undefined } {
  const multicallContract = useMulticallContract()

  const addresses: string[] = useMemo(
    () =>
      uncheckedAddresses
        ? uncheckedAddresses
            .map(isAddress)
            .filter((a): a is string => a !== false)
            .sort()
        : [],
    [uncheckedAddresses]
  )

  const results = useSingleContractMultipleData(
    multicallContract,
    'getEthBalance',
    addresses.map(address => [address])
  )

  return useMemo(
    () =>
      addresses.reduce<{ [address: string]: CurrencyAmount }>((memo, address, i) => {
        const value = results?.[i]?.result?.[0]
        if (value) memo[address] = CurrencyAmount.ether(JSBI.BigInt(value.toString()), chainId)
        return memo
      }, {}),
    [chainId, addresses, results]
  )
}

/**
 * Returns a map of token addresses to their eventually consistent token balances for a single account.
 */
export function useTokenBalancesWithLoadingIndicator(
  address?: string,
  tokens?: (Token | undefined)[]
): [{ [tokenAddress: string]: TokenAmount | undefined }, boolean] {
  const validatedTokens: Token[] = useMemo(
    () => tokens?.filter((t?: Token): t is Token => isAddress(t?.address) !== false) ?? [],
    [tokens]
  )

  const validatedTokenAddresses = useMemo(() => validatedTokens.map(vt => vt.address), [validatedTokens])

  const balances = useMultipleContractSingleData(validatedTokenAddresses, ERC20_INTERFACE, 'balanceOf', [address])

  const anyLoading: boolean = useMemo(() => balances.some(callState => callState.loading), [balances])

  return [
    useMemo(
      () =>
        address && validatedTokens.length > 0
          ? validatedTokens.reduce<{ [tokenAddress: string]: TokenAmount | undefined }>((memo, token, i) => {
              const value = balances?.[i]?.result?.[0]
              const amount = value ? JSBI.BigInt(value.toString()) : undefined
              if (amount) {
                memo[token.address] = new TokenAmount(token, amount)
              }
              return memo
            }, {})
          : {},
      [address, validatedTokens, balances]
    ),
    anyLoading
  ]
}

export function useTokenBalances(
  address?: string,
  tokens?: (Token | undefined)[]
): { [tokenAddress: string]: TokenAmount | undefined } {
  return useTokenBalancesWithLoadingIndicator(address, tokens)[0]
}

// get the balance for a single token/account combo
export function useTokenBalance(account?: string, token?: Token): TokenAmount | undefined {
  const tokenBalances = useTokenBalances(account, [token])
  if (!token) return undefined
  return tokenBalances[token.address]
}

export function useNearTokenBalance(account?: string, token?: Token): TokenAmount | undefined {
  const [tokenBalance, setTokenBalance] = useState<TokenAmount>()

  useEffect(() => {
    async function checkTokenBalance() {
      if (token) {
        const balance = await nearFn.getTokenBalance(token?.address, account)
        const nearBalance = new TokenAmount(token, balance)

        setTokenBalance(nearBalance)
      }
    }

    checkTokenBalance()
  }, [account, token])

  return useMemo(() => tokenBalance, [tokenBalance])
}

export function useCurrencyBalances(
  chainId: ChainId,
  account?: string,
  currencies?: (Currency | undefined)[]
): (CurrencyAmount | undefined)[] {
  const tokens = useMemo(() => currencies?.filter((currency): currency is Token => currency instanceof Token) ?? [], [
    currencies
  ])

  const tokenBalances = useTokenBalances(account, tokens)
  const containsETH: boolean = useMemo(
    () => currencies?.some(currency => chainId && currency === CAVAX[chainId]) ?? false,
    [chainId, currencies]
  )
  const ethBalance = useETHBalances(chainId, containsETH ? [account] : [])

  return useMemo(
    () =>
      currencies?.map(currency => {
        if (!account || !currency) return undefined
        if (currency instanceof Token) return tokenBalances[currency.address]
        if (chainId && currency === CAVAX[chainId]) return ethBalance[account]
        return undefined
      }) ?? [],
    [chainId, account, currencies, ethBalance, tokenBalances]
  )
}

export function useCurrencyBalance(
  chainId: ChainId,
  account?: string,
  currency?: Currency
): CurrencyAmount | undefined {
  return useCurrencyBalances(chainId, account, [currency])[0]
}

// get the total owned and unharvested PNG for account
export function useAggregatePngBalance(): TokenAmount | undefined {
  const { account } = useActiveWeb3React()
  const chainId = useChainId()

  const useTokenBalance_ = useTokenBalanceHook[chainId]
  const useTotalPngEarned = useTotalPngEarnedHook[chainId]

  const png = chainId ? PNG[chainId] : undefined

  const pngBalance: TokenAmount | undefined = useTokenBalance_(account ?? undefined, png)
  const pngUnHarvested: TokenAmount | undefined = useTotalPngEarned()

  if (!png) return undefined

  return new TokenAmount(png, JSBI.add(pngBalance?.raw ?? JSBI.BigInt(0), pngUnHarvested?.raw ?? JSBI.BigInt(0)))
}
