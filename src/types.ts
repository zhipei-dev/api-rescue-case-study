export type OrderEvent = { eventId: string; orderId: string; amountCents: number };

export type ProviderFailure = {
  status?: number;
  message: string;
  transient?: boolean;
};

export interface OrderProvider {
  /**
   * Charges one business operation. Production adapters MUST send order.orderId as
   * their provider idempotency key and honor AbortSignal by cancelling the real
   * network request. The signal is a cooperative abort deadline, not a hard kill.
   */
  charge(order: OrderEvent, signal: AbortSignal): Promise<void>;
}
