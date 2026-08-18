import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Transfer } from '../../transfer/entities/transfer.entity';
import { Transaction } from '../../transaction/entities/transaction.entity';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  balance: number;

  @Column()
  currency: string;

  @VersionColumn()
  version: number;

  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Transaction[];

  @OneToMany(() => Transfer, (transfer) => transfer.from_wallet)
  sent_transfers: Transfer[];

  @OneToMany(() => Transfer, (transfer) => transfer.to_wallet)
  received_transfers: Transfer[];

  @OneToOne(() => User, (user) => user.wallet)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn()
  created_at: Date;
}
