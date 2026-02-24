import { db } from "../../config/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, Timestamp, updateDoc } from "firebase/firestore";
import { Note } from "../../types/taskTypes";

const NOTES_COLLECTION = "notes";

export const getNotes = async (): Promise<Note[]> => {
    try {
        const q = query(collection(db, NOTES_COLLECTION), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Note));
    } catch (error) {
        console.error("Error getting notes:", error);
        return [];
    }
};

export const addNote = async (title: string, content: string, importance: 'low' | 'medium' | 'high', userId: string, deadline?: string) => {
    try {
        await addDoc(collection(db, NOTES_COLLECTION), {
            title,
            content,
            importance,
            createdAt: Timestamp.now(),
            createdBy: userId,
            deadline: deadline ? Timestamp.fromDate(new Date(deadline)) : null
        });
    } catch (error) {
        console.error("Error adding note:", error);
        throw error;
    }
};

export const deleteNote = async (noteId: string) => {
    try {
        await deleteDoc(doc(db, NOTES_COLLECTION, noteId));
    } catch (error) {
        console.error("Error deleting note:", error);
        throw error;
    }
};

export const updateNote = async (noteId: string, data: Partial<Note>) => {
    try {
        // Si hay deadline, convertirlo a Timestamp
        const updateData: Record<string, unknown> = { ...data };
        if (typeof data.deadline === 'string') {
            updateData.deadline = Timestamp.fromDate(new Date(data.deadline));
        }

        await updateDoc(doc(db, NOTES_COLLECTION, noteId), updateData);
    } catch (error) {
        console.error("Error updating note:", error);
        throw error;
    }
};
