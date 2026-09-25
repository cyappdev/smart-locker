import {
    Alert,
    Button,
    LinearProgress,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
} from "@mui/material";
import { type ListLockerResponse } from "../../../api/locker/listLocker";

interface LockerListingProps {
    result?: ListLockerResponse;
    loading: boolean;
    error: boolean;
    page: number;
    rowsPerPage: number;
    onRetry: () => void;
    onPageChange: (page: number) => void;
    onRowsPerPageChange: (limit: number) => void;
}

export const LockerListing = ({
    result, loading, error, page, rowsPerPage, onRetry, onPageChange, onRowsPerPageChange,
}: LockerListingProps) => {
    return (
        <Paper>
            {loading && <LinearProgress />}
            {error && (
                <Alert
                    severity="error"
                    action={<Button color="inherit" onClick={onRetry}>Retry</Button>}
                >
                    Unable to load lockers. Please try again.
                </Alert>
            )}
            <TableContainer>
                <Table aria-busy={loading}>
                    <TableHead>
                        <TableRow>
                            <TableCell>Identifier</TableCell>
                            <TableCell>Size</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Package identifier</TableCell>
                            <TableCell>Pickup code</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {!result && (loading || error) ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center">
                                    {loading ? "Loading lockers…" : "Locker data is unavailable."}
                                </TableCell>
                            </TableRow>
                        ) : result?.data.length ? result.data.map((locker) => (
                            <TableRow key={locker.id} hover>
                                <TableCell component="th" scope="row">{locker.identifier}</TableCell>
                                <TableCell>{locker.size}</TableCell>
                                <TableCell>{locker.status}</TableCell>
                                <TableCell>{locker.packageIdentifier ?? "—"}</TableCell>
                                <TableCell>{locker.pickupCode ?? "—"}</TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={5} align="center">No lockers found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination
                component="div"
                count={result?.pagination.total ?? 0}
                page={page}
                rowsPerPage={rowsPerPage}
                rowsPerPageOptions={[10, 25, 50]}
                disabled={loading}
                onPageChange={(_, nextPage) => onPageChange(nextPage)}
                onRowsPerPageChange={(event) => onRowsPerPageChange(Number(event.target.value))}
            />
        </Paper>
    );
};
