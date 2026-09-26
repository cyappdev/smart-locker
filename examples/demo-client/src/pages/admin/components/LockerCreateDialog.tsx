import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from '@mui/material';
import {
  createLocker,
  type CreateLockerResponse,
} from '../../../api/locker/createLocker';
import {
  SIZE_CATEGORIES,
  type SizeCategory,
} from '../../../types/size-category';

interface LockerCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (locker: CreateLockerResponse) => void;
}

export const LockerCreateDialog = ({
  open,
  onClose,
  onCreated,
}: LockerCreateDialogProps) => {
  const [identifier, setIdentifier] = useState('');
  const [size, setSize] = useState<SizeCategory>('small');
  const [validationError, setValidationError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createLocker,
    retry: false,
    onSuccess: (locker) => {
      void queryClient.invalidateQueries({ queryKey: ['lockers'] });
      setIdentifier('');
      setSize('small');
      onCreated(locker);
      onClose();
    },
  });
  const submitting = mutation.isPending;
  const serverMessage = isAxiosError(mutation.error)
    ? mutation.error.response?.data?.message
    : undefined;
  const error =
    validationError ??
    (mutation.isError
      ? typeof serverMessage === 'string'
        ? serverMessage
        : 'Unable to create locker. Please try again.'
      : null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier || trimmedIdentifier.length > 128) {
      setValidationError('Enter an identifier between 1 and 128 characters.');
      return;
    }

    setValidationError(null);
    mutation.mutate({ identifier: trimmedIdentifier, size });
  }

  function handleClose() {
    if (submitting) return;
    setIdentifier('');
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
      aria-labelledby="create-locker-title"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle id="create-locker-title">Create locker</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            autoFocus
            required
            fullWidth
            margin="normal"
            label="Identifier"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            disabled={submitting}
            slotProps={{ htmlInput: { maxLength: 128 } }}
          />
          <TextField
            select
            required
            fullWidth
            margin="normal"
            label="Size"
            value={size}
            onChange={(event) => {
              const selected = SIZE_CATEGORIES.find(
                (value) => value === event.target.value,
              );
              if (selected) setSize(selected);
            }}
            disabled={submitting}
          >
            {SIZE_CATEGORIES.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create locker'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
