import { Logger } from '@maticnetwork/chain-indexer-framework';
import { ethers } from 'ethers';
import SlackNotify from './slack-notify.js';
import { IProof, ITransaction } from "../types/index.js";
import GasStation from './gas-station.js';
import TransactionService from "./transaction.js";
const _GLOBAL_INDEX_MAINNET_FLAG = BigInt(2 ** 64);

let failedTx: { [key: number]: number } = {};
let completedTx: { [key: string]: boolean } = {};
/**
 * AutoClaimService service class is a class which has function to autoclaim transactions
 * 
 * @class AutoClaimService
 */
export default class AutoClaimService {
    /**
     * @constructor
     * 
     * @param {ethers.Contract} compressContract
     * @param {ethers.Contract} bridgeContract
     * @param {TransactionService} transactionService
     * @param {GasStation} gasStation
     * @param {string} destinationNetwork
     * @param {SlackNotify | null} slackNotify
     */
    constructor(
        private compressContract: ethers.Contract,
        private bridgeContract: ethers.Contract,
        private transactionService: TransactionService,
        private gasStation: GasStation,
        private slackNotify: SlackNotify | null = null
    ) {}

    async estimateGas(transaction: ITransaction, proof: IProof): Promise<boolean> {
        try {
            if (transaction.leaf_type === 0) {
                await this.bridgeContract.claimAsset.estimateGas(
                    proof.merkle_proof,
                    proof.rollup_merkle_proof,
                    transaction.global_index,
                    proof.main_exit_root,
                    proof.rollup_exit_root,
                    transaction.orig_net,
                    transaction.orig_addr,
                    transaction.dest_net,
                    transaction.dest_addr,
                    transaction.amount,
                    transaction.metadata
                )
            } else {
                await this.bridgeContract.claimMessage.estimateGas(
                    proof.merkle_proof,
                    proof.rollup_merkle_proof,
                    transaction.global_index,
                    proof.main_exit_root,
                    proof.rollup_exit_root,
                    transaction.orig_net,
                    transaction.orig_addr,
                    transaction.dest_net,
                    transaction.dest_addr,
                    transaction.amount,
                    transaction.metadata
                )
            }

            return true;
        } catch (error: any) {
            if (!transaction.deposit_cnt) {
                return false;
            }

            if (failedTx[transaction.deposit_cnt]) {
                failedTx[transaction.deposit_cnt] = failedTx[transaction.deposit_cnt] + 1;
            } else {
                failedTx[transaction.deposit_cnt] = 1;
            }

            if (
                this.slackNotify &&
                failedTx[transaction.deposit_cnt] &&
                (failedTx[transaction.deposit_cnt] - 1) % 25 === 0 &&
                failedTx[transaction.deposit_cnt] <= 51 &&
                !completedTx[`${transaction.network_id}-${transaction.deposit_cnt}`]
            ) {
                await this.slackNotify.notifyAdminForError({
                    claimType: transaction.orig_addr as string,
                    bridgeTxHash: transaction.tx_hash as string,
                    sourceNetwork: transaction.network_id,
                    destinationNetwork: transaction.dest_net,
                    error: error.message ? error.message.slice(0, 100) : '',
                    depositIndex: transaction.deposit_cnt
                });
            }

            return false;
        }
    }

    async claim(batch: { transaction: ITransaction, proof: IProof}[]): Promise<ethers.TransactionResponse | null> {
        const gasPrice = await this.gasStation.getGasPrice();
        let response: ethers.TransactionResponse | null = null;
        try {
            Logger.info({
                type: 'claimBatch',
                transactionHashes: batch.map(obj => obj.transaction.tx_hash)
            })

            const main_exit_root = batch[0].proof.main_exit_root;
            const rollup_exit_root = batch[0].proof.rollup_exit_root;
            const data = []
            for (const tx of batch) {
                if (tx.transaction.leaf_type === 0) {
                    data.push({
                        smtProofLocalExitRoot: tx.proof.merkle_proof,
                        smtProofRollupExitRoot: tx.proof.rollup_merkle_proof,
                        globalIndex: tx.transaction.global_index,
                        originNetwork: tx.transaction.orig_net,
                        originAddress: tx.transaction.orig_addr,
                        destinationAddress: tx.transaction.dest_addr,
                        amount: tx.transaction.amount,
                        metadata: tx.transaction.metadata,
                        isMessage: false
                    })
                } else {
                    data.push({
                        smtProofLocalExitRoot: tx.proof.merkle_proof,
                        smtProofRollupExitRoot: tx.proof.rollup_merkle_proof,
                        globalIndex: tx.transaction.global_index,
                        originNetwork: tx.transaction.orig_net,
                        originAddress: tx.transaction.orig_addr,
                        destinationAddress: tx.transaction.dest_addr,
                        amount: tx.transaction.amount,
                        metadata: tx.transaction.metadata,
                        isMessage: true
                    })
                }
            }

            response = await this.compressContract.compressClaimCall(
                main_exit_root,
                rollup_exit_root,
                data,
                { gasPrice }
            )
            response = await this.compressContract.sendCompressedClaims(response)
            for (const tx of batch) {
                completedTx[`${tx.transaction.network_id}-${tx.transaction.deposit_cnt}`] = true
            }

            Logger.info({
                type: 'claimBatch',
                status: 'success',
                claimTransactionHash: response?.hash
            })
        } catch (error: any) {
            Logger.info({ "aqui": "aqui" })

            Logger.error({ error })
        }
        return response;
    }

    async claimTransactions() {
        try {
            Logger.info({
                location: 'AutoClaimService',
                function: 'claimTranclaimsactions',
                call: 'started'
            })
            let transactions = await this.transactionService.getPendingTransactions();
            let finalClaimableTransaction = [];
            for (const transaction of transactions) {
                const proof = await this.transactionService.getProof(transaction.network_id, transaction.deposit_cnt as number)
                if (proof) {
                    let estimateGas = await this.estimateGas(transaction, proof);
                    if (estimateGas) {
                        finalClaimableTransaction.push({
                            transaction,
                            proof
                        })
                    }
                }
            }

            Logger.info({
                location: 'AutoClaimService',
                function: 'claimTransactions',
                call: 'finalClaimableTransaction length',
                data: finalClaimableTransaction.length
            })
            const length = finalClaimableTransaction.length;
            for (let i = 0; i < length; i += 5) {
                const batch = finalClaimableTransaction.slice(i, i + 5);
                await this.claim(batch);
            }

            Logger.info({
                location: 'AutoClaimService',
                function: 'claimTransactions',
                call: 'completed'
            })
            return;
        }
        catch (error: any) {
            Logger.error({
                location: 'AutoClaimService',
                function: 'claimTransactions',
                error: error.message ? error.message : error
            });
            throw error;
        }
    }
}
