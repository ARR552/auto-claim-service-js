import axios from 'axios';
import { Logger } from '@maticnetwork/chain-indexer-framework';
import { IProof, ITransaction } from "../types/index.js";

const _GLOBAL_INDEX_MAINNET_FLAG = BigInt(2 ** 64);

export default class TransactionService {

    constructor(
        private proofUrl: string,
        private transactionUrl: string,
        private destinationNetwork: string,
    ) {}

    async getPendingTransactions(): Promise<ITransaction[]> {
        Logger.info({
            location: 'TransactionService',
            function: 'getPendingTransactions',
            call: 'started'
        })
        let transactions: ITransaction[] = [];
        try {
            let transactionData = await axios.get(
                `${this.transactionUrl}?dest_net=${this.destinationNetwork}&leaf_type=0&dest_addr=0x0000000000000000000000000000000000000000`
            );
            if (transactionData) {
                transactions = transactionData.data.deposits;
            }
        } catch (error: any) {
            Logger.error({
                location: 'TransactionService',
                function: 'getPendingTransactions',
                error: error.message
            });
        }

        Logger.info({
            location: 'TransactionService',
            function: 'getPendingTransactions',
            call: 'completed',
            length: transactions.length
        })
        return transactions;

    }

    async getProof(sourceNetwork: number, depositCount: number): Promise<IProof | null> {
        let proof: IProof | null = null;
        try {
            let proofData = await axios.get(
                `${this.proofUrl}?net_id=${sourceNetwork}&deposit_cnt=${depositCount}`
            );
            if (
                proofData && proofData.data && proofData.data.proof &&
                proofData.data.proof.merkle_proof && !proofData.data.proof.merkle_proof.message
            ) {
                proof = proofData.data.proof;
            }
        } catch (error: any) {
            Logger.error({
                location: 'TransactionService',
                function: 'getProof',
                error: error.message,
                data: {
                    sourceNetwork,
                    depositCount,
                    url: `${this.proofUrl}?networkId=${sourceNetwork}&depositCount=${depositCount}`
                }
            });
        }
        return proof;
    }
}
