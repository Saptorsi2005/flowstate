import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState('light');

    useEffect(() => {
        // 1. Initial Load - Read from chrome.storage if available
        if (window.chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get('theme', (res) => {
                const initialTheme = res.theme === 'dark' ? 'dark' : 'light';
                setTheme(initialTheme);
            });

            // 2. Listen for changes from the Extension Popup
            const handleStorageChange = (changes, namespace) => {
                if (namespace === 'local' && changes.theme) {
                    setTheme(changes.theme.newValue === 'dark' ? 'dark' : 'light');
                }
            };
            chrome.storage.onChanged.addListener(handleStorageChange);

            return () => {
                chrome.storage.onChanged.removeListener(handleStorageChange);
            };
        } else {
            // Fallback for non-extension environments (standard web)
            const cached = localStorage.getItem('flowstate-theme');
            if (cached === 'dark') setTheme('dark');
        }
    }, []);

    // Apply theme to document
    useEffect(() => {
        if (theme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.body.removeAttribute('data-theme');
            document.documentElement.removeAttribute('data-theme');
        }
    }, [theme]);

    // Expose manual toggle for web UI
    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);

        // Sync back to extension storage if available
        if (window.chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ theme: newTheme });
        } else {
            localStorage.setItem('flowstate-theme', newTheme);
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
