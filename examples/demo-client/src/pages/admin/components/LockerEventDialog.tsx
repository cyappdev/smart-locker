import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
} from "@mui/material";
import { listLockerEvents } from "../../../api/locker/listLockerEvents";
import type { Locker } from "../../../api/locker/listLocker";

interface LockerEventDialogProps {
    locker: Locker | null;
    onClose: () => void;
}

export const LockerEventDialog = ({ locker, onClose }: LockerEventDialogProps) => {
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const events = useQuery({
        queryKey: ["lockerEvents", locker?.id, page + 1, rowsPerPage],
        queryFn: () => listLockerEvents(locker!.id, page + 1, rowsPerPage),
        enabled: locker !== null,
    });

    function handleClose() {
        setPage(0);
        onClose();
    }

    return (
        <Dialog
            open={locker !== null}
            onClose={handleClose}
            fullWidth
            maxWidth="md"
            aria-labelledby="locker-events-title"
            slotProps={{ paper: { sx: { height: "80vh" } } }}
        >
            <DialogTitle id="locker-events-title">Events for locker {locker?.identifier}</DialogTitle>
            <DialogContent sx={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                {events.isFetching && <LinearProgress />}
                {events.isError && (
                    <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => { void events.refetch(); }}>Retry</Button>}>
                        Unable to load locker events.
                    </Alert>
                )}
                <TableContainer sx={{ flex: 1, minHeight: 0 }}>
                    <Table stickyHeader size="small" aria-busy={events.isFetching}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Date</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Event</TableCell>
                                <TableCell>Package identifier</TableCell>
                                <TableCell align="right">Charges (cents)</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {events.data?.data.length ? events.data.data.map((event) => (
                                <TableRow key={event.id}>
                                    <TableCell>{new Date(event.createdAt).toLocaleString()}</TableCell>
                                    <TableCell>{event.lockerStatus}</TableCell>
                                    <TableCell>{event.eventType.replaceAll("_", " ")}</TableCell>
                                    <TableCell>{event.packageIdentifier ?? "—"}</TableCell>
                                    <TableCell align="right">{event.chargesInCents ?? "—"}</TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={5} align="center">
                                        {events.isFetching ? "Loading events…" : events.isError ? "Events are unavailable." : "No events found."}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination
                    component="div"
                    count={events.data?.pagination.total ?? 0}
                    page={page}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={[10, 25, 50]}
                    onPageChange={(_, nextPage) => setPage(nextPage)}
                    onRowsPerPageChange={(event) => {
                        setRowsPerPage(Number(event.target.value));
                        setPage(0);
                    }}
                />
            </DialogContent>
            <DialogActions><Button size="small" onClick={handleClose}>Close</Button></DialogActions>
        </Dialog>
    );
};
