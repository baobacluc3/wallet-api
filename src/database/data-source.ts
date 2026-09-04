import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { AuthEvent } from '../auth/entities/auth-event.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { Transfer } from '../transfer/entities/transfer.entity';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { CreateProductionSchema1736121600000 } from './migrations/1736121600000-CreateProductionSchema';

const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'wallet_api',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [User, Wallet, Transaction, Transfer, RefreshToken, AuthEvent],
  migrations: [CreateProductionSchema1736121600000],
  synchronize: false,
};

export default new DataSource(dataSourceOptions);
