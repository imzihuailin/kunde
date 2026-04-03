import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AddBookPage } from './pages/AddBookPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { HomePage } from './pages/HomePage'
import { ReaderPage } from './pages/ReaderPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/add" element={<AddBookPage />} />
        <Route path="/read/:bookId" element={<ReaderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
