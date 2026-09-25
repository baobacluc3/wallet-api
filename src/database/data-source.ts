import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { Transaction } from '../transaction/entities/transaction.entity';
import { Transfer } from '../transfer/entities/transfer.entity';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { CreateWalletSchema1736121600000 } from './migrations/1736121600000-CreateWalletSchema';

const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'wallet_api',
  entities: [User, Wallet, Transaction, Transfer],
  migrations: [CreateWalletSchema1736121600000],
  synchronize: false,
};

export default new DataSource(dataSourceOptions);
