import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuthEventType } from '../enums/auth-event-type.enum';
import { User } from '../../users/entities/user.entity';

@Entity('auth_events')
@Index('IDX_auth_events_user_created_at', ['userId', 'createdAt'])
@Index('IDX_auth_events_type_created_at', ['type', 'createdAt'])
export class AuthEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  @ManyToOne(() => User, (user) => user.authEvents, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: AuthEventType,
    enumName: 'auth_event_type_enum',
  })
  type: AuthEventType;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'text' })
  userAgent: string;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
