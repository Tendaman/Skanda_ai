//frontend\src\components\ReloadButton.tsx
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface ReloadButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function ReloadButton({ onClick, disabled = false, className = "" }: ReloadButtonProps) {
  return (
    <Button
      onClick={onClick}
      className={`text-xs bg-gray-500 text-white hover:bg-gray-600 px-2 py-1.5 rounded-md shadow-sm ${className}`}
      size="sm"
      title="Regenerate response"
      disabled={disabled}
    >
      <RefreshCw className="h-3 w-3" />
    </Button>
  );
}