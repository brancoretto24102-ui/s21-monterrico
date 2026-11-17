-- The account is authorized separately; no Auth identity or password is created here.
INSERT INTO s21.profiles(id,name,permissions)
VALUES('invitado','Invitado','["dashboard","publishers.read","groups.read","comments.read","groups.all","pdf.single","pdf.bulk"]')
ON CONFLICT(id) DO NOTHING;
