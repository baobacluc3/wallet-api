import {
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
@Index(['wallet', 'created_at']) // composite index matches the WHERE + ORDER BY exactly
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column()
  amount: number;

  @Column()
  balance_before: number;

  @Column()
  balance_after: number;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
  })
  status: TransactionStatus;

  @Column({ nullable: true, unique: true })
  idempotencyKey?: string | null;

  @Column({ nullable: true, length: 64 })
  referenceId?: string | null;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @ManyToOne(() => Transfer, (transfer) => transfer.transactions)
  @JoinColumn({ name: 'transfer_id' })
  transfer: Transfer;

  @CreateDateColumn()
  created_at: Date;
}
