from rest_framework import serializers
from .models import Document

class DocumentSerializer(serializers.ModelSerializer):
    owner_username = serializers.ReadOnlyField(source='owner.username')

    class Meta:
        model = Document
        fields = ['id', 'title', 'content', 'is_public', 'owner_username', 'created_at', 'updated_at']
        read_only_fields = ['id', 'owner_username', 'created_at', 'updated_at']