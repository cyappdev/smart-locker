import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listLocker } from "../../api/locker/listLocker";
import { useState } from "react";
import { Alert, Button, Container, Stack } from "@mui/material";
import { LockerCreateDialog } from "./components/LockerCreateDialog";
import { LockerListing } from "./components/LockerListing";

export const AdminPage = () => {
    const [createOpen, setCreateOpen] = useState(false);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const lockers = useQuery({
        queryKey: ["lockers", { page: page + 1, limit: rowsPerPage, search: "" }],
        queryFn: () => listLocker({ search: "", page: page + 1, limit: rowsPerPage }),
        placeholderData: keepPreviousData,
    });
    const [createdIdentifier, setCreatedIdentifier] = useState<string | null>(null);

    return (
        <Container component="section" maxWidth="lg" sx={{ p: 4 }}>
            <Stack spacing={2}>
                <Stack direction="row" spacing={2}>
                    <Button variant="contained" onClick={() => setCreateOpen(true)}>Create locker</Button>
                </Stack>
                {createdIdentifier && (
                    <Alert severity="success" onClose={() => setCreatedIdentifier(null)}>
                        Locker {createdIdentifier} created.
                    </Alert>
                )}
                <LockerListing
                    result={lockers.data}
                    loading={lockers.isFetching}
                    error={lockers.isError}
                    page={page}
                    rowsPerPage={rowsPerPage}
                    onRetry={() => { void lockers.refetch(); }}
                    onPageChange={setPage}
                    onRowsPerPageChange={(limit) => {
                        setRowsPerPage(limit);
                        setPage(0);
                    }}
                />
            </Stack>
            <LockerCreateDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={(locker) => {
                    setCreatedIdentifier(locker.identifier);
                }}
            />
        </Container>
    );
};
