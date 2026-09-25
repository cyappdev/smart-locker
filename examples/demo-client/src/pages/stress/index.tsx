import { useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import {
    Button, Container, MenuItem, Paper, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { storePackage } from "../../api/locker/storePackage";
import { SIZE_CATEGORIES, type SizeCategory } from "../../types/size-category";

interface RequestRow {
    no: number;
    packageIdentifier: string;
    size: SizeCategory;
    status: string;
    locker?: string;
    pickupCode?: string;
}

export const StressTestPage = () => {
    const [concurrency, setConcurrency] = useState("1");
    const [size, setSize] = useState<SizeCategory>("small");
    const [rows, setRows] = useState<RequestRow[]>([]);
    const [running, setRunning] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (running) return;

        const count = Number(concurrency);
        if (!Number.isInteger(count) || count < 1 || count > 20) return;

        const requests = Array.from({ length: count }, (_, index) => ({
            no: index + 1,
            packageIdentifier: `Concurrent ${index + 1}`,
            size,
            status: "loading",
        }));
        setRows(requests);
        setRunning(true);

        try {
            await Promise.all(requests.map(async (request) => {
                try {
                    const result = await storePackage({
                        packageIdentifier: request.packageIdentifier,
                        size: request.size,
                    });
                    setRows((current) => current.map((row) => row.no === request.no
                        ? { ...row, status: "success", locker: result.identifier, pickupCode: result.pickupCode }
                        : row));
                } catch (error) {
                    const code = isAxiosError<{ code?: string }>(error) ? error.response?.data?.code : undefined;
                    setRows((current) => current.map((row) => row.no === request.no
                        ? { ...row, status: code ?? "REQUEST_FAILED" }
                        : row));
                }
            }));
        } finally {
            setRunning(false);
        }
    }

    return (
        <Container component="section" maxWidth="lg" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Typography variant="h5" component="h1">Concurrency Test</Typography>
                <Stack component="form" onSubmit={handleSubmit} direction="row" spacing={2} sx={{ alignItems: "center" }}>
                    <TextField
                        sx={{ minWidth: 300 }}
                        label="Concurrency"
                        type="number"
                        required
                        value={concurrency}
                        onChange={(event) => setConcurrency(event.target.value)}
                        slotProps={{ htmlInput: { min: 1, max: 20, step: 1 } }}
                        disabled={running}
                    />
                    <TextField
                        select
                        sx={{ minWidth: 300 }}
                        label="Package size"
                        value={size}
                        onChange={(event) => {
                            const selected = SIZE_CATEGORIES.find((value) => value === event.target.value);
                            if (selected) setSize(selected);
                        }}
                        disabled={running}
                    >
                        {SIZE_CATEGORIES.map((value) => (
                            <MenuItem key={value} value={value}>{value}</MenuItem>
                        ))}
                    </TextField>
                    <Button type="submit" variant="contained" disabled={running}>
                        {running ? "Running…" : "Run test"}
                    </Button>
                </Stack>
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>No</TableCell>
                                <TableCell>Package identifier</TableCell>
                                <TableCell>Size</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Locker</TableCell>
                                <TableCell>Pickup code</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.length ? rows.map((row) => (
                                <TableRow key={row.no}>
                                    <TableCell>{row.no}</TableCell>
                                    <TableCell>{row.packageIdentifier}</TableCell>
                                    <TableCell>{row.size}</TableCell>
                                    <TableCell>{row.status}</TableCell>
                                    <TableCell>{row.status === "success" ? row.locker : "—"}</TableCell>
                                    <TableCell>{row.status === "success" ? row.pickupCode : "—"}</TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">Run a test to see requests.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Stack>
        </Container>
    );
};
