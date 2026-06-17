import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

/**
 * Mocked authentication layer.
 * --------------------------------------------------------------------------
 * The user explicitly requested a **frontend-mocked** auth for this phase.
 * All accounts live in localStorage under two keys:
 *
 *   quantdesk.users      → { [email]: { id, email, password, createdAt } }
 *   quantdesk.session    → { id, email }
 *
 * The backend never receives a password. It only sees `user_id` (a UUID
 * generated client-side on sign-up) which scopes the watchlist + broker
 * credentials documents. When real auth lands we replace this provider
 * without touching downstream consumers.
 */

const AuthContext = createContext(null);

const STORAGE_USERS = "quantdesk.users";
const STORAGE_SESSION = "quantdesk.session";

const readUsers = () => {
    try {
        const raw = localStorage.getItem(STORAGE_USERS);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const writeUsers = (users) => {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
};

const readSession = () => {
    try {
        const raw = localStorage.getItem(STORAGE_SESSION);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeSession = (session) => {
    if (session) {
        localStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
    } else {
        localStorage.removeItem(STORAGE_SESSION);
    }
};

const normalizeEmail = (email) =>
    typeof email === "string" ? email.trim().toLowerCase() : "";

const newUserId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [bootstrapped, setBootstrapped] = useState(false);

    useEffect(() => {
        const session = readSession();
        if (session && session.id && session.email) {
            setUser(session);
        }
        setBootstrapped(true);
    }, []);

    const signUp = useCallback((emailRaw, passwordRaw) => {
        const email = normalizeEmail(emailRaw);
        const password = (passwordRaw || "").toString();

        if (!email || !email.includes("@")) {
            throw new Error("Inserisci un'email valida");
        }
        if (password.length < 6) {
            throw new Error("La password deve avere almeno 6 caratteri");
        }

        const users = readUsers();
        if (users[email]) {
            throw new Error("Un account con questa email esiste già");
        }

        const record = {
            id: newUserId(),
            email,
            password, // NOTE: mocked auth only — never store passwords this way in production
            createdAt: new Date().toISOString(),
        };
        users[email] = record;
        writeUsers(users);

        const session = { id: record.id, email: record.email };
        writeSession(session);
        setUser(session);
        return session;
    }, []);

    const signIn = useCallback((emailRaw, passwordRaw) => {
        const email = normalizeEmail(emailRaw);
        const password = (passwordRaw || "").toString();

        const users = readUsers();
        const record = users[email];
        if (!record || record.password !== password) {
            throw new Error("Credenziali non valide");
        }

        const session = { id: record.id, email: record.email };
        writeSession(session);
        setUser(session);
        return session;
    }, []);

    const signOut = useCallback(() => {
        writeSession(null);
        setUser(null);
    }, []);

    const value = useMemo(
        () => ({
            user,
            isAuthenticated: !!user,
            bootstrapped,
            signIn,
            signUp,
            signOut,
        }),
        [user, bootstrapped, signIn, signUp, signOut],
    );

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used inside <AuthProvider>");
    }
    return ctx;
};
