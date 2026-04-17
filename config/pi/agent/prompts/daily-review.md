Run a careful engineering review of the current repository state.

Preferred flow:

1. Call `repo_context_snapshot` with a concrete query that matches the current task.
2. Call `review_gate_check` using the most appropriate diff scope.
3. Summarize:
   - risks
   - missing tests
   - documentation gaps
   - recommended next edits

Keep the review practical and specific to changed files.
