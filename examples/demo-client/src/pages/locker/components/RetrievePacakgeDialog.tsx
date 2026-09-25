import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import {
    Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    Stack, TextField, Typography,
} from "@mui/material";
import { retrievePackage, type RetrievePackageResponse } from "../../../api/locker/retrievePackage";

interface RetrievePackageDialogProps {
    open: boolean;
    onClose: () => void;
}

export const RetrievePackageDialog = ({ open, onClose }: RetrievePackageDialogProps) => {
    const [lockerIdentifier, setLockerIdentifier] = useState("");
    const [pickupCode, setPickupCode] = useState("");
    const [validationError, setValidationError] = useState<string | null>(null);
    const [result, setResult] = useState<RetrievePackageResponse | null>(null);
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: retrievePackage,
        retry: false,
        onSuccess: (response) => {
            setResult(response);
            if (response.status === "retrieved") {
                void queryClient.invalidateQueries({ queryKey: ["lockers"] });
            }
        },
    });
    const serverMessage = isAxiosError(mutation.error) ? mutation.error.response?.data?.message : undefined;
    const error = validationError ?? (mutation.isError
        ? typeof serverMessage === "string" ? serverMessage : "Unable to retrieve package. Please try again."
        : null);

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (mutation.isPending || result) return;
        const identifier = lockerIdentifier.trim();
        if (!identifier || identifier.length > 128) {
            setValidationError("Enter a locker identifier between 1 and 128 characters.");
            return;
        }
        if (!/^\d{6}$/.test(pickupCode)) {
            setValidationError("Pickup code must contain exactly 6 digits.");
            return;
        }
        setValidationError(null);
        mutation.mutate({ lockerIdentifier: identifier, pickupCode });
    }

    function handleClose() {
        if (mutation.isPending) return;
        setLockerIdentifier("");
        setPickupCode("");
        setValidationError(null);
        setResult(null);
        mutation.reset();
        onClose();
    }

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs" aria-labelledby="retrieve-package-title">
            <form onSubmit={handleSubmit}>
                <DialogTitle id="retrieve-package-title">Retrieve package</DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error">{error}</Alert>}
                    {result ? (
                        <Stack spacing={2}>
                            <Alert severity={result.status === "retrieved" ? "success" : "info"}>
                                {result.status === "retrieved" ? "Package retrieved successfully." : "Confirm storage charges to retrieve your package."}
                            </Alert>
                            <Typography>Package: {result.packageIdentifier}</Typography>
                            <Typography>Locker: {lockerIdentifier.trim()}</Typography>
                            <Typography>Storage charges: {result.chargesInCents} cents</Typography>
                            {result.status === "charges_required" && (
                                <Typography>Charges are recalculated when you confirm.</Typography>
                            )}
                        </Stack>
                    ) : (
                        <>
                            <TextField
                                autoFocus required fullWidth margin="normal"
                                label="Locker identifier"
                                value={lockerIdentifier}
                                onChange={(event) => setLockerIdentifier(event.target.value)}
                                disabled={mutation.isPending}
                                slotProps={{ htmlInput: { maxLength: 128 } }}
                            />
                            <TextField
                                required fullWidth margin="normal"
                                label="Pickup code"
                                value={pickupCode}
                                onChange={(event) => setPickupCode(event.target.value)}
                                disabled={mutation.isPending}
                                slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]{6}", maxLength: 6 } }}
                                helperText="Enter your 6-digit pickup code."
                            />
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    {result?.status === "retrieved" ? (
                        <Button onClick={handleClose} variant="contained">Done</Button>
                    ) : (
                        <>
                            <Button onClick={handleClose} disabled={mutation.isPending}>Cancel</Button>
                            {result?.status === "charges_required" ? (
                                <Button
                                    type="button" variant="contained" disabled={mutation.isPending}
                                    onClick={() => {
                                        if (mutation.isPending) return;
                                        mutation.mutate({ lockerIdentifier: lockerIdentifier.trim(), pickupCode, confirmCharges: true });
                                    }}
                                >
                                    {mutation.isPending ? "Retrieving…" : "Confirm charges and retrieve"}
                                </Button>
                            ) : (
                                <Button type="submit" variant="contained" disabled={mutation.isPending}>
                                    {mutation.isPending ? "Retrieving…" : "Retrieve package"}
                                </Button>
                            )}
                        </>
                    )}
                </DialogActions>
            </form>
        </Dialog>
    );
};
