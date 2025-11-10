import React, {createContext, useContext, useState, useRef, ReactNode} from "react";

export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    partial?: boolean;
};

export type Suggestion = string;

interface ChatStreamContextType {
    messages: ChatMessage[];
    suggestions: Suggestion[];
    sendMessage: (prompt: string) => Promise<void>;
    loading: boolean;
}

const ChatStreamContext = createContext<ChatStreamContextType | undefined>(undefined);

export const useChatStream = () => {
    const ctx = useContext(ChatStreamContext);
    if (!ctx) throw new Error("useChatStream must be used within ChatStreamProvider");
    return ctx;
};

export const ChatStreamProvider = ({children}: { children: ReactNode }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    console.log("messages", messages)
    const sendMessage = async (prompt: string) => {
        // Cancel any ongoing stream
        abortRef.current?.abort();
        setLoading(true);
        setSuggestions([]);
        const userMsg: ChatMessage = {
            id: `${Date.now()}-user`,
            role: "user",
            content: prompt,
        };
        setMessages((prev) => [...prev, userMsg]);

        const controller = new AbortController();
        abortRef.current = controller;

        let assistantMsg: ChatMessage = {
            id: `${Date.now()}-assistant`,
            role: "assistant",
            content: "",
            partial: true,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        try {
            const res = await fetch("/api/stream", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({prompt}),
                signal: controller.signal,
            });
            if (!res.body) throw new Error("No response body");
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let done = false;
            let newContent = "";
            while (!done) {
                const {value, done: doneReading} = await reader.read();
                done = doneReading;
                if (value) {
                    buffer += decoder.decode(value, {stream: true});
                    let lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        console.log('[ChatStream] Received line:', line); // <-- LOG
                        try {
                            const data = JSON.parse(line);
                            console.log('[ChatStream] Parsed data:', data); // <-- LOG
                            if (data.type === "partial_response") {
                                console.log("partial_response respopnse", data)

                                if (typeof data.content === "string") {
                                    newContent += data.value;
                                    setMessages((prev) =>
                                        prev.map((msg) =>
                                            msg.id === assistantMsg.id
                                                ? {...msg, content: newContent, partial: true}
                                                : msg
                                        )
                                    );
                                } else {
                                    console.warn("[ChatStream] Missing or invalid content for partial_response", data);
                                }
                            } else if (data.type === "response") {
                                console.log("full respopnse", data)
                                if (typeof data.content === "string") {
                                    setMessages((prev) =>
                                        prev.map((msg) =>
                                            msg.id === assistantMsg.id
                                                ? {...msg, content: data.value, partial: false}
                                                : msg
                                        )
                                    );
                                } else {
                                    console.warn("[ChatStream] Missing or invalid content for response", data);
                                }
                            } else if (data.type === "suggestions") {
                                setSuggestions(data.value || []);
                            }
                        } catch (e) {
                            console.warn('[ChatStream] JSON parse error:', e, line); // <-- LOG
                            // Ignore JSON parse errors for incomplete lines
                        }
                    }
                }
            }
        } catch (e) {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === assistantMsg.id
                        ? {...msg, content: "[Error: failed to fetch response]", partial: false}
                        : msg
                )
            );
        } finally {
            setLoading(false);
            abortRef.current = null;
        }
    };

    return (
        <ChatStreamContext.Provider value={{messages, suggestions, sendMessage, loading}}>
            {children}
        </ChatStreamContext.Provider>
    );
};
