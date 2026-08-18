import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { Transaction } from '../../transaction/entities/transaction.entity';

@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Wallet, (wallet) => wallet.sentTransfers)
  @JoinColumn({ name: 'from_wallet_id' })
  fromWallet: Wallet;

  @ManyToOne(() => Wallet, (wallet) => wallet.receivedTransfers)
  @JoinColumn({ name: 'to_wallet_id' })
  toWallet: Wallet;

  @OneToMany(() => Transaction, (transaction) => transaction.transfer)
  transactions: Transaction[];

  @Column()
  amount: number;

  @Column()
  status: string;

  @Column()
  reference: string;

  @CreateDateColumn()
  createdAt: Date;
}
