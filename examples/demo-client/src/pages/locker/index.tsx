import { Button, Container, Stack, Typography } from "@mui/material"
import { ConsoleContainer } from "./components/ConsoleContainer"
import { useState } from "react"
import { StorePackageDialog } from "./components/StorePackageDialog"
import { RetrievePackageDialog } from "./components/RetrievePackageDialog"

export const LockerPage = () => {
    const [storeOpen, setStoreOpen] = useState(false);
    const [retrieveOpen, setRetrieveOpen] = useState(false);
    return <Container sx={{ flex: 1, display: "flex", flexDirection: "column", p: 4 }}>
        <ConsoleContainer>
            <Stack spacing={2} sx={{ alignItems: 'center' }} >
                <Typography variant="h5" >
                    Smart Locker Console
                </Typography>
                <Button fullWidth variant="outlined" size="large" onClick={() => setStoreOpen(true)}>
                    Store Package
                </Button>
                <Button fullWidth variant="outlined" size="large" onClick={() => setRetrieveOpen(true)}>
                    Retrieve Package
                </Button>
            </Stack>
        </ConsoleContainer>
        <StorePackageDialog open={storeOpen} onClose={() => setStoreOpen(false)} />
        <RetrievePackageDialog open={retrieveOpen} onClose={() => setRetrieveOpen(false)} />
    </Container>
}
