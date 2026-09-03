# purge-old-dsrs

Deletes Hub DSR rows older than seven days (retention requirement) and relies on cascading foreign keys to remove related training tasks + certification snapshots.

## Deploy

```bash
supabase functions deploy purge-old-dsrs --project-ref <project>
```

Expose the function via Supabase Edge Function URL and trigger it daily from an external scheduler. For dry-runs append `?preview=true` to the URL; the function will return the number of reports that would be deleted without mutating data.
