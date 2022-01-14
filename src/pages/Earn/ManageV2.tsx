import React, { useMemo } from 'react'
import { useMinichefStakingInfos } from '../../state/stake/hooks'
import { RouteComponentProps } from 'react-router-dom'
import Manage from './Manage'
import { usePair } from '../../data/Reserves'
import { wrappedCurrency } from '../../utils/wrappedCurrency'
import { useCurrency, useTokens } from '../../hooks/Tokens'
import { useActiveWeb3React } from '../../hooks'
import { useSingleContractMultipleData } from '../../state/multicall/hooks'
import { useRewardViaMultiplierContract } from '../../hooks/useContract'
import { Token, TokenAmount } from '@pangolindex/sdk'

const ManageV2: React.FC<RouteComponentProps<{ currencyIdA: string; currencyIdB: string }>> = ({
  match: {
    params: { currencyIdA, currencyIdB }
  }
}) => {
  const { chainId, account } = useActiveWeb3React()

  // get currencies and pair
  const [currencyA, currencyB] = [useCurrency(currencyIdA), useCurrency(currencyIdB)]
  const tokenA = wrappedCurrency(currencyA ?? undefined, chainId)
  const tokenB = wrappedCurrency(currencyB ?? undefined, chainId)

  const [, stakingTokenPair] = usePair(tokenA, tokenB)
  const miniChefStaking = useMinichefStakingInfos(2, stakingTokenPair)?.[0]
  const rewardAddress = miniChefStaking?.rewardsAddress

  const rewardContract = useRewardViaMultiplierContract(rewardAddress)

  const rewardTokenAmounts = useSingleContractMultipleData(rewardContract, 'pendingTokens', [
    [0, account as string, '1000000000000'] // TODO:
  ])
  const rewardTokens = useTokens(rewardTokenAmounts?.[0]?.result?.tokens)
  const rewardAmounts = rewardTokenAmounts?.[0]?.result?.amounts

  const rewardTokensAmount = useMemo(() => {
    if (!rewardTokens) return []
    return rewardTokens.map((rewardToken, index) => new TokenAmount(rewardToken as Token, rewardAmounts[index]))
  }, [rewardAmounts, rewardTokens])

  console.log(rewardTokensAmount)

  return <Manage version="2" stakingInfo={miniChefStaking} currencyA={currencyA} currencyB={currencyB} />
}

export default ManageV2
