import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Wallet1 } from '../../wallet/entities/wallet1.entity';

export enum Type {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

export enum Status {
  SUCCESS = 'SUCCESS',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
}
@Entity('transactions1')
export class Transaction1 {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  balance_before:bigint;

  @Column()
  balance_after:bigint;

  @ManyToOne(() => Wallet1, (wallet) => wallet.transactions)
  wallet: Wallet1;

  @Column()
  type:Type;

  @Column()
  status:Status;

  @Column()
  amount:bigint;



}