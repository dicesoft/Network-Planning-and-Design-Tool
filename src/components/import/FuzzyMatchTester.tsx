/**
 * Fuzzy Match Tester — Dialog wrapper for the debug FuzzyMatchTesterContent.
 * Used from the Tools page as a standalone dialog.
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { FuzzyMatchTesterContent } from '@/components/debug/FuzzyMatchTester';

interface FuzzyMatchTesterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FuzzyMatchTester: React.FC<FuzzyMatchTesterProps> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="fuzzy-match-tester">
        <DialogHeader>
          <DialogTitle>Fuzzy Match Tester</DialogTitle>
          <DialogDescription>
            Test string similarity and name matching algorithms used during import.
          </DialogDescription>
        </DialogHeader>
        <FuzzyMatchTesterContent />
      </DialogContent>
    </Dialog>
  );
};
