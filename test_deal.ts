export interface BrokerClosedDeal {
    id: string;
    positionId: string;
    accountId: string;
    symbol: string;
    type: "DEAL_TYPE_BUY" | "DEAL_TYPE_SELL";
    price: number;
    openPrice?: number;
    profit: number;
    commission?: number;
    swap?: number;
    time: string;
    reason: string;
    comment: string;
}
