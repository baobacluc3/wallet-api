import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { Transfer } from '../../transfer/entities/transfer.entity';

/*
CREDIT         → money added to wallet
DEBIT          → money removed from wallet
TRANSFER_IN    → money received from another wallet
TRANSFER_OUT   → money sent to another wallet
*/

export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('transactions')
@Check('CHK_transactions_amount_positive', '"amount_cents" > 0')
@Check(
  'CHK_transactions_balance_non_negative',
  '"balance_before_cents" >= 0 AND "balance_after_cents" >= 0',
)
@Check(
  'CHK_transactions_balance_transition',
  `(
    "status" = 'COMPLETED' AND (
      ("type" IN ('CREDIT', 'TRANSFER_IN') AND "balance_after_cents" = "balance_before_cents" + "amount_cents") OR
      ("type" IN ('DEBIT', 'TRANSFER_OUT') AND "balance_after_cents" = "balance_before_cents" - "amount_cents")
    )
  ) OR (
    "status" <> 'COMPLETED' AND "balance_after_cents" = "balance_before_cents"
  )`,
)
@Index('IDX_transactions_wallet_created_at', ['walletId', 'createdAt'])
@Index('IDX_transactions_wallet_type_created_at', [
  'walletId',
  'type',
  'createdAt',
])
@Index('IDX_transactions_wallet_amount_cents', ['walletId', 'amountCents'])
@Index(
  'UQ_transactions_wallet_idempotency_key',
  ['walletId', 'idempotencyKey'],
  {
    unique: true,
    where: '"idempotency_key" IS NOT NULL',
  },
)
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: TransactionType,
    enumName: 'transaction_type_enum',
  })
  type: TransactionType;

  @Column({ name: 'amount_cents', type: 'integer' })
  amountCents: number;

  @Column({ name: 'balance_before_cents', type: 'integer' })
  balanceBeforeCents: number;

  @Column({ name: 'balance_after_cents', type: 'integer' })
  balanceAfterCents: number;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    enumName: 'transaction_status_enum',
  })
  status: TransactionStatus;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  idempotencyKey?: string | null;

  @Column({ name: 'reference_id', type: 'varchar', nullable: true, length: 64 })
  referenceId?: string | null;

  @Column({ name: 'wallet_id', type: 'integer' })
  walletId: number;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ name: 'transfer_id', type: 'integer', nullable: true })
  transferId: number | null;

  @ManyToOne(() => Transfer, (transfer) => transfer.transactions, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'transfer_id' })
  transfer: Transfer | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
