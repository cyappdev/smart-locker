# Standardization

This API plan is a draft. Response examples are illustrative and not finalized. Allocation rules will be documented separately or defined during controller/service implementation.

## Error Structure

```
{
  "code": "LOCKER_NOT_FOUND",
  "message": "No suitable locker found."
}
```

### Error Codes

| Error Code               | HTTP status | description                            |
| ------------------------ | ----------- | -------------------------------------- |
| LOCKER_NOT_FOUND         | 404         | No suitable locker found               |
| LOCKER_IDENTIFIER_EXISTS | 409         | Identifier conflict when create locker |
| PACKAGE_NOT_FOUND        | 404         | No current package matches the locker identifier and pickup code |

# Level 1

`[POST] /lockers`

Create a locker entry in the database. New lockers have status `available`; `status` is not an accepted request body field.

Request Body

| attribute  | required | description                                        |
| ---------- | -------- | -------------------------------------------------- |
| identifier | true     | Unique physical label for the locker, such as `A1` |
| size       | true     | Size of the locker `"small", "medium", "large"`    |

Response (draft)
HTTP 201

```
{
    "id": 1,
    "identifier": "A1",
    "size": "small",
    "status": "available"
}
```

Error

HTTP 409

```
{
    "code": "LOCKER_IDENTIFIER_EXISTS",
    "message": "A locker with the same identifier already exists."
}
```

`[GET] /lockers`

List lockers with their current availability. Default sort is by `identifier` in ascending order. Pickup codes are not included in the list response.

Query Parameters

| attribute | required | description                                      |
| --------- | -------- | ------------------------------------------------ |
| page      | false    | Page of result default `1`                       |
| limit     | false    | Limit of result default `10`                     |
| search    | false    | Wildcard search of locker `identifier`           |
| status    | false    | Filter by `available`, `inactive`, or `occupied` |

Response (draft example with `limit=20`)
HTTP 200

```
{
    "data": [
        {
            "id": 1,
            "identifier": "A1",
            "size": "small",
            "status": "available"
        }
    ],
    "pagination": {
        "page": 1,
        "limit": 20,
        "total": 120,
        "totalPages": 6
    }
}
```

`[POST] /lockers/store`

Store a package in a suitable available locker. A successful request represents completed storage, with hardware interaction mocked. The locker becomes `occupied`, and its current package identifier and pickup code are saved.

Request Body

| attribute         | required | description                                                                                  |
| ----------------- | -------- | -------------------------------------------------------------------------------------------- |
| size              | true     | Size of the package `"small", "medium", "large"`                                             |
| packageIdentifier | true     | Non-unique package name, label, or order reference; multiple packages may use the same value |

Response
Error

HTTP 404

```
{
  "code": "LOCKER_NOT_FOUND",
  "message": "No suitable locker found."
}
```

Success (draft)

HTTP 200

```
{
  "lockerId": 1,
  "identifier": "A1",
  "packageIdentifier": "ORDER-123",
  "pickupCode": "048291",
  "status": "occupied"
}
```

# Level 2

`[POST] /lockers/retrieve`

Retrieve the current package using its locker identifier and pickup code. A successful request represents completed retrieval, with hardware interaction mocked, and makes the locker available for another delivery.

Request Body

| attribute        | required | description |
| ---------------- | -------- | ----------- |
| lockerIdentifier | true     | String. Physical locker label, such as `"A1"`, matching `identifier` returned by the storage endpoint. |
| pickupCode       | true     | String. Pickup code returned when the package was stored; preserve leading zeros, such as `"048291"`. |

Response
Error

HTTP 404

Return `PACKAGE_NOT_FOUND` when the locker identifier is unknown, the pickup code does not match that locker's current assignment (including a code belonging to another locker), or the locker has no current package (including a repeated request after successful retrieval). Failed retrieval requests leave the locker and its current assignment unchanged.

```
{
  "code": "PACKAGE_NOT_FOUND",
  "message": "No package found for the provided locker identifier and pickup code."
}
```

Success

HTTP 200

```
{
  "success": true,
  "packageIdentifier": "xxx"
}
```


# Level 3
