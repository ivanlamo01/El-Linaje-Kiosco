"use client";

import React, { useState, useEffect } from "react";
import { Addition } from "../types/additionTypes";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";

const AdditionsTable: React.FC = () => {
  const [additions, setAdditions] = useState<Addition[]>([]);

  useEffect(() => {
    const loadAdditions = async () => {
      const q = query(
        collection(db, "Productos"),
        orderBy("dateAdded", "desc"),
        limit(5)
      );
      const querySnapshot = await getDocs(q);

      const additionsList: Addition[] = querySnapshot.docs.map((doc) => {
        const data = doc.data();

        let date: Date;

        if (data.dateAdded instanceof Timestamp) {
          date = data.dateAdded.toDate(); // Firestore Timestamp
        } else if (data.dateAdded instanceof Date) {
          date = data.dateAdded; // Ya es Date
        } else if (typeof data.dateAdded === "string") {
          date = new Date(data.dateAdded); // ISO string
        } else {
          date = new Date(0); // Fallback
        }

        return {
          title: data.title || "Sin título",
          dateAdded: date,
        };
      });

      setAdditions(additionsList);
    };

    loadAdditions();
  }, []);

  return (
    <div className="bg-card p-6 rounded-2xl shadow-lg border border-border">
      <h3 className="text-2xl font-bold text-primary mb-2">Últimas Adiciones</h3>
      <h5 className="text-sm text-muted-foreground mb-4">Productos añadidos recientemente</h5>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-secondary text-secondary-foreground uppercase text-xs">
              <th className="px-4 py-3 rounded-tl-lg">Producto</th>
              <th className="px-4 py-3 rounded-tr-lg">Fecha de adición</th>
            </tr>
          </thead>
          <tbody>
            {additions.map((addition, index) => (
              <tr
                key={index}
                className="hover:bg-muted/50 transition-colors border-b border-border last:border-none"
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  {addition.title}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {addition.dateAdded instanceof Date &&
                    !isNaN(addition.dateAdded.getTime())
                    ? addition.dateAdded.toLocaleDateString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                    : "Fecha inválida"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdditionsTable;
