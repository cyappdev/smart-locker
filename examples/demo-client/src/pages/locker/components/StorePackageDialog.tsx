import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { storePackage } from '../../../api/locker/storePackage';
import {
  SIZE_CATEGORIES,
  type SizeCategory,
} from '../../../types/size-category';

interface StorePackageDialogProps {
  open: boolean;
  onClose: () => void;
}

export const StorePackageDialog = ({
  open,
  onClose,
}: StorePackageDialogProps) => {
  const [packageIdentifier, setPackageIdentifier] = useState('');
  const [size, setSize] = useState<SizeCategory>('small');
  const [validationError, setValidationError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: storePackage,
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lockers'] });
    },
  });
  const serverMessage = isAxiosError(mutation.error)
    ? mutation.error.response?.data?.message
    : undefined;
  const error =
    validationError ??
    (mutation.isError
      ? typeof serverMessage === 'string'
        ? serverMessage
        : 'Unable to store package. Please try again.'
      : null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending || mutation.isSuccess) return;

    const identifier = packageIdentifier.trim();
    if (!identifier || identifier.length > 128) {
      setValidationError(
        'Enter a package identifier between 1 and 128 characters.',
      );
      return;
    }

    setValidationError(null);
    mutation.mutate({ packageIdentifier: identifier, size });
  }

  function handleClose() {
    if (mutation.isPending) return;
    setPackageIdentifier('');
    setSize('small');
    setValidationError(null);
    mutation.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="store-package-title"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle id="store-package-title">Store package</DialogTitle>
        <DialogContent>
          {mutation.isSuccess ? (
            <Stack spacing={2}>
              <Alert severity="success">Package stored successfully.</Alert>
              <Typography>
                Package: {mutation.data.packageIdentifier}
              </Typography>
              <Typography>Locker: {mutation.data.identifier}</Typography>
              <Typography variant="h6">
                Pickup code: {mutation.data.pickupCode}
              </Typography>
              <Typography>
                Keep the locker identifier and pickup code to retrieve your
                package.
              </Typography>
            </Stack>
          ) : (
            <>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                autoFocus
                required
                fullWidth
                margin="normal"
                label="Package identifier"
                value={packageIdentifier}
                onChange={(event) => setPackageIdentifier(event.target.value)}
                disabled={mutation.isPending}
                slotProps={{ htmlInput: { maxLength: 128 } }}
              />
              <TextField
                select
                required
                fullWidth
                margin="normal"
                label="Package size"
                value={size}
                onChange={(event) => {
                  const selected = SIZE_CATEGORIES.find(
                    (value) => value === event.target.value,
                  );
                  if (selected) setSize(selected);
                }}
                disabled={mutation.isPending}
              >
                {SIZE_CATEGORIES.map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {mutation.isSuccess ? (
            <Button onClick={handleClose} variant="contained">
              Done
            </Button>
          ) : (
            <>
              <Button onClick={handleClose} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Storing…' : 'Store package'}
              </Button>
            </>
          )}
        </DialogActions>
      </form>
    </Dialog>
  );
};
