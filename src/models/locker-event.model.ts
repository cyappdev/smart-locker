import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../configs/database.ts";
import { LOCKER_EVENT_TYPES, type LockerEventType } from "../types/locker-event-type.ts";
import { LOCKER_STATUSES, type LockerStatus } from "../types/locker-status.ts";
import { Locker } from "./locker.model.ts";

export class LockerEvent extends Model<
  InferAttributes<LockerEvent>,
  InferCreationAttributes<LockerEvent>
> {
  declare id: CreationOptional<number>;
  declare lockerId: number;
  declare eventType: LockerEventType;
  declare lockerStatus: LockerStatus;
  declare packageIdentifier: string | null;
  declare chargesInCents: number | null;
  declare createdAt: CreationOptional<Date>;
}

LockerEvent.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    lockerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "locker_id",
      references: { model: Locker, key: "id" },
    },
    eventType: {
      type: DataTypes.ENUM(...LOCKER_EVENT_TYPES),
      allowNull: false,
      field: "event_type",
    },
    lockerStatus: {
      type: DataTypes.ENUM(...LOCKER_STATUSES),
      allowNull: false,
      field: "locker_status",
    },
    packageIdentifier: {
      type: new DataTypes.STRING(128),
      allowNull: true,
      field: "package_identifier",
    },
    chargesInCents: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "charges_in_cents",
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "created_at",
    },
  },
  {
    sequelize,
    tableName: "locker_events",
    timestamps: true,
    updatedAt: false,
  },
);
