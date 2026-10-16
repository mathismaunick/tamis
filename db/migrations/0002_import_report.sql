-- Le compte rendu d'un import : le rang de chaque besoin avant et après le traitement,
-- pour dire au PO ce qui a bougé (« Dépendances : 5ᵉ → 3ᵉ ») sans recalculer le passé.
alter table import_batches add column if not exists ranks_before jsonb;
alter table import_batches add column if not exists ranks_after jsonb;
