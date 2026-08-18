import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { Transfer } from '../../transfer/entities/transfer.entity';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  walletId: number;

  @Column()
  type: string;

  @Column()
  amount: number;

  @Column()
  balance_before: number;

  @Column()
  balance_after: number;

  @Column()
  status: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  wallet: Wallet;

  @ManyToOne(() => Transfer, (transfer) => transfer.transactions)
  @JoinColumn({ name: 'transfer_id' })
  transfer: Transfer;

  @CreateDateColumn()
  createdAt: Date;
}
