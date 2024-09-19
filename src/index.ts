import { Logger } from "@maticnetwork/chain-indexer-framework/logger";
import AutoClaimService from "./services/auto-claim.js";
import { ethers } from 'ethers';
import { Contract, Web3 } from 'web3';
import config from "./config/index.js";
import claimCompressorAbi from "./abi/claim_compressor.js";
import bridgeAbi from "./abi/bridge.js";
import SlackNotify from "./services/slack-notify.js";
import GasStation from "./services/gas-station.js";
import TransactionService from "./services/transaction.js";

Logger.create({
    sentry: {
        dsn: config.LOGGER.SENTRY_DSN,
        level: 'error'
    },
    datadog: {
        api_key: config.LOGGER.DATADOG_API_KEY,
        service_name: config.LOGGER.DATADOG_APP_KEY
    },
    console: {
        level: "debug"
    }
});

let autoClaimService: AutoClaimService;
async function run() {
    while (true) {
        await autoClaimService.claimTransactions();
        await new Promise(r => setTimeout(r, 15000));
    }
}

async function start() {
    try {

        // const provider = new Web3.JsonRpcProvider(config.RPC_URL);
        const provider = new Web3(config.RPC_URL);

        // const wallet = new ethers.Wallet(config.PRIVATE_KEY as string, provider);
        const wallet = provider.eth.accounts.wallet.add(String(config.PRIVATE_KEY))[0];

        let slackNotify = null;
        if (config.SLACK_URL) {
            slackNotify = new SlackNotify(config.SLACK_URL)
        }

        let ethersClients: { [key: string]: ethers.JsonRpcProvider } = {}
        for (let index = 0; index < JSON.parse(config.SOURCE_NETWORKS).length; index += 1) {
            ethersClients[JSON.parse(config.SOURCE_NETWORKS)[index]] = new ethers.JsonRpcProvider(JSON.parse(config.SOURCE_NETWORKS_RPC)[index])
        }
        const claimCompressor = new Contract(claimCompressorAbi, config.CLAIM_COMPRESSOR_CONTRACT, provider);
        const bridge = new Contract(bridgeAbi, config.BRIDGE_CONTRACT, provider);

        autoClaimService = new AutoClaimService(
            claimCompressor,
            bridge,
            new TransactionService(
                config.PROOF_URL as string,
                config.TRANSACTIONS_URL as string,
                config.SOURCE_NETWORKS,
                ethersClients,
                config.TRANSACTIONS_API_KEY,
                config.PROOF_API_KEY
            ),
            new GasStation(config.GAS_STATION_URL as string),
            slackNotify,
            wallet.address
        );

        run();
    } catch (error) {
        // Logger.error({ error });
    }
};

start();
