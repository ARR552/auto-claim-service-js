export interface INotifyParams {
    claimType: string
    bridgeTxHash: string
    sourceNetwork: number
    destinationNetwork: number
    error: string
    depositIndex: number
}

export interface IProof {
    merkle_proof: Array<string>,
    rollup_merkle_proof: Array<string>,
    main_exit_root: string,
    rollup_exit_root: string
}

export interface ITransaction {
    leaf_type: number,
    orig_net: number,
    orig_addr: string,
    amount: string,
    dest_net: number,
    dest_addr: string,
    block_num: number,
    deposit_cnt: number,
    network_id: number,
    tx_hash: string,
    claim_tx_hash: string,
    metadata: string,
    ready_for_claim: boolean,
    global_index: string,
}