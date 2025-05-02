import { Container, CssBaseline, ThemeProvider, createTheme } from '@mui/material'
// import './App.css'
import ResourcesTable from './components/ResourcesTable'

function App() {
  const theme = createTheme({
    palette: {
      mode: 'light',
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg">
        <ResourcesTable />
      </Container>
    </ThemeProvider>
  )
}

export default App
