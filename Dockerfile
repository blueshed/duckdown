# Use an official Python runtime as a parent image
FROM python:3-slim
RUN apt-get update && apt-get install -y git

# Set the working directory to /app
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# upgrade pip to make sure it can use git repos
RUN pip install --upgrade pip
RUN pip install duckdown liteblue

# Install any needed packages
RUN [ -f requirements.txt ] && pip install -r requirements.txt ||  echo "No requirements.txt"

# Make port 80 available to the world outside this container
EXPOSE 80

# Define environment variable
ENV PYTHONPATH ".:${PYTHONPATH}"
ENV PORT 80

