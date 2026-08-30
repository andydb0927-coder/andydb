import { RouterProvider } from 'react-router-dom'
import { createAppRouter } from './router'
import { CloudAccountProvider } from '../features/account/CloudAccountProvider'

const router = createAppRouter()

export default function App() {
  return <CloudAccountProvider><RouterProvider router={router} /></CloudAccountProvider>
}
