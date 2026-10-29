"""Train the root-cause classifier.   Run: python train.py"""
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import GroupShuffleSplit
from common import FEATURES, CAUSES, make_features, estimate_capacity

df = pd.read_csv("data/train.csv").fillna({"complaint_text": ""})
X_parts, y_parts, g_parts = [], [], []
for sid, s in df.groupby("session_id"):
    s = s.reset_index(drop=True)
    cap = estimate_capacity(s)                  # same estimator used at analysis time
    X_parts.append(make_features(s, cap)); y_parts.append(s["label"]); g_parts.append(s["session_id"])
X, y, g = pd.concat(X_parts, ignore_index=True), pd.concat(y_parts, ignore_index=True), pd.concat(g_parts, ignore_index=True)

tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=1).split(X, y, g))
model = RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced",
                               n_jobs=-1, random_state=1)
model.fit(X.iloc[tr], y.iloc[tr])
pred = model.predict(X.iloc[te])
print(classification_report(y.iloc[te], pred, digits=3))
print("Confusion matrix (rows=true, cols=pred):", list(model.classes_))
print(confusion_matrix(y.iloc[te], pred, labels=model.classes_))

imp = pd.Series(model.feature_importances_, index=FEATURES).sort_values(ascending=False)
print("\nTop features:\n", imp.head(8).round(3).to_string())

model.fit(X, y)                                 # final model on everything
joblib.dump({"model": model, "features": FEATURES}, "models/rootcause.joblib")
print("\nSaved models/rootcause.joblib")
