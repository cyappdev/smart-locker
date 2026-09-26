import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../configs/database.ts';
import {
  LOCKER_STATUSES,
  SIZE_CATEGORIES,
  type LockerStatus,
  type SizeCategory,
} from '../types/locker.ts';

export class Locker extends Model<
  InferAttributes<Locker>,
  InferCreationAttributes<Locker>
> {
  declare id: CreationOptional<number>;
  declare identifier: string;
  declare size: SizeCategory;
  declare status: CreationOptional<LockerStatus>;
  declare packageIdentifier: string | null;
  declare lastOccupiedAt: Date | null;
  declare pickupCode: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Locker.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    identifier: {
      type: new DataTypes.STRING(128),
      unique: true,
      allowNull: false,
    },
    size: {
      type: DataTypes.ENUM(...SIZE_CATEGORIES),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...LOCKER_STATUSES),
      allowNull: false,
      defaultValue: 'available',
    },
    packageIdentifier: {
      type: new DataTypes.STRING(128),
      allowNull: true,
      field: 'package_identifier',
    },
    lastOccupiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_occupied_at',
    },
    pickupCode: {
      type: new DataTypes.STRING(128),
      allowNull: true,
      unique: true,
      field: 'pickup_code',
    },
    createdAt: { type: DataTypes.DATE, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
  },
  {
    sequelize,
    tableName: 'lockers',
    timestamps: true,
  },
);
