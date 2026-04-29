import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Plus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  validateSRLGCode,
  isDuplicateSRLGCode,
  formatSRLGCode,
} from '@/core/validation/fiberValidation';

interface SRLGCodeEditorProps {
  codes: string[];
  onChange: (codes: string[]) => void;
  className?: string;
}

export const SRLGCodeEditor: React.FC<SRLGCodeEditorProps> = ({
  codes,
  onChange,
  className,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAddCode = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // Validate the code
    const validation = validateSRLGCode(trimmed);
    if (!validation.valid) {
      setError(validation.errors[0]);
      return;
    }

    // Check for duplicates
    if (isDuplicateSRLGCode(trimmed, codes)) {
      setError('SRLG code already exists');
      return;
    }

    // Add the formatted code
    const formatted = formatSRLGCode(trimmed);
    onChange([...codes, formatted]);
    setInputValue('');
    setError(null);
  }, [inputValue, codes, onChange]);

  const handleRemoveCode = useCallback(
    (index: number) => {
      const newCodes = codes.filter((_, i) => i !== index);
      onChange(newCodes);
    },
    [codes, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddCode();
      }
    },
    [handleAddCode]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    if (error) setError(null);
  }, [error]);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Code tags */}
      {codes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {codes.map((code, index) => (
            <div
              key={`${code}-${index}`}
              className="bg-info/10 border-info/20 flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-info"
            >
              <span className="text-xs font-medium">{code}</span>
              <button
                onClick={() => handleRemoveCode(index)}
                className="hover:bg-info/20 rounded p-0.5 transition-colors"
                aria-label={`Remove ${code}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-2 text-xs italic text-text-muted">
          No SRLG codes assigned
        </div>
      )}

      {/* Add input */}
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter SRLG code (e.g., DUCT-A1)"
            className={cn(
              'w-full h-9 px-3 rounded-md border bg-secondary text-sm text-text-primary',
              'placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent',
              error ? 'border-danger' : 'border-border'
            )}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAddCode}
          disabled={!inputValue.trim()}
          className="h-9 px-3"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-danger">
          <AlertTriangle className="h-3 w-3" />
          <span>{error}</span>
        </div>
      )}

      {/* Help text */}
      <div className="text-xs text-text-muted">
        SRLG (Shared Risk Link Group) codes identify links sharing physical infrastructure.
      </div>
    </div>
  );
};
