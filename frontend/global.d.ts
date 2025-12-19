//frontend\global.d.ts
declare module "*.css"
declare module "ai/rsc"
declare module "ai"
declare module 'ai/react' {
  import * as React from 'react';
    export function useChat(props?: any): {
        messages: any[];
        input: string;
        handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
        handleSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
        isLoading: boolean;
        stop: () => void;
        append: (message: any) => void;
    };
    export type Message = {
        id: string;
        role: 'user' | 'ai' | 'system';
        content: string;
    };
}